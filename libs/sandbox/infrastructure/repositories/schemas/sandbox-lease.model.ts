import { CoreDocument } from '@libs/core/infrastructure/repositories/model/mongodb';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Mongoose schema for the sandbox_leases collection.
 *
 * Each document represents a coordination lease for a single PR (keyed by prKey).
 * The _id IS the prKey string — Mongo's natural uniqueness guarantee serves as the
 * upsert filter for the atomic acquire operation (see sandbox-lease.repository.ts).
 *
 * Do NOT use a MongoDB TTL index (expireAfterSeconds) — the reaper must call
 * Sandbox.kill() before deleting the doc so that orphaned E2B sandboxes are
 * cleaned up properly.
 */
@Schema({ collection: 'sandbox_leases', timestamps: false })
export class SandboxLeaseModel extends CoreDocument {
    // prKey: "{orgId}:{repoId}:{prNumber}" — used as the document _id.
    // @Prop({ type: String }) overrides the default ObjectId so { _id: prKey }
    // queries don't blow up with a CastError.
    @Prop({ type: String, required: true })
    declare _id: string;

    @Prop({ type: String, required: false })
    sandboxId?: string; // E2B sandbox ID; null while state === 'CREATING'

    /**
     * State enum. INVALIDATED is required to handle the mid-create invalidation
     * race (RESEARCH.md Pitfall 5): when a force-push/pr-close event fires while
     * acquire() is still in-flight (state = CREATING), invalidate() sets this to
     * INVALIDATED instead of deleting the doc. The create path checks for this
     * state after updateReady() and immediately kills the sandbox, preventing
     * orphaned E2B sandboxes with no Mongo lease document.
     */
    @Prop({
        type: String,
        required: true,
        enum: ['CREATING', 'READY', 'PAUSED', 'INVALIDATED'],
    })
    state: string;

    @Prop({ type: Number, required: true, default: 0 })
    leaseCount: number; // ref-count of active leases

    @Prop({ type: Date, required: true })
    createdAt: Date;

    @Prop({ type: Date, required: true })
    expiresAt: Date; // used by reaper TTL query
}

export const SandboxLeaseSchema =
    SchemaFactory.createForClass(SandboxLeaseModel);

// Reaper range scan: find all leases past their expiry regardless of state
SandboxLeaseSchema.index({ expiresAt: 1 });

// Invalidate-by-sandboxId when prKey is unknown (sparse: unused entries have no entry)
SandboxLeaseSchema.index({ sandboxId: 1 }, { sparse: true });
