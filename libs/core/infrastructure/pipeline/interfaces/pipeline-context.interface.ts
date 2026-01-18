import { AutomationStatus } from '@libs/automation/domain/automation/enum/automation-status';

export interface PipelineContext {
    statusInfo: {
        status: AutomationStatus;
        message?: string;
        jumpToStage?: string;
        skippedReason?: {
            status: AutomationStatus;
            message?: string;
            stageName?: string;
            jumpToStage?: string;
        };
    };
    pipelineVersion: string;
    errors: PipelineError[];
    pipelineMetadata?: {
        pipelineId?: string;
        pipelineName?: string;
        parentPipelineId?: string;
        rootPipelineId?: string;
        [key: string]: any;
    };
    workflowJobId?: string;
}

export interface PipelineError {
    pipelineId?: string;
    stage: string;
    substage?: string;
    error: Error;
    metadata?: any;
}
