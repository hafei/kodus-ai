import { createReadStream, unlink, writeFileSync } from 'fs';
import { join } from 'path';

import {
    Body,
    Controller,
    Get,
    Inject,
    Post,
    Query,
    Res,
    StreamableFile,
    UseGuards,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import {
    AST_ANALYSIS_SERVICE_TOKEN,
    IASTAnalysisService,
} from '@libs/code-review/domain/contracts/ASTAnalysisService.contract';
import { BackoffPresets } from '@libs/common/utils/polling';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';

function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return [...value.entries()];
    }
    return value;
}

@Controller('code-base')
export class CodeBaseController {
    constructor(
        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },
    ) {}
}
