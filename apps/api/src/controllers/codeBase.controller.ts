import { writeFileSync, createReadStream, unlink } from 'fs';
import { join } from 'path';

import {
    Controller,
    Post,
    Body,
    StreamableFile,
    Res,
    Inject,
    UseGuards,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiSecurity,
} from '@nestjs/swagger';

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
    PolicyGuard,
    CheckPolicies,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';

function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return [...value.entries()];
    }
    return value;
}

@ApiTags('Code Base')
@ApiSecurity('Bearer', [])
@Controller('code-base')
export class CodeBaseController {
    constructor(
        @Inject(AST_ANALYSIS_SERVICE_TOKEN)
        private readonly codeASTAnalysisService: IASTAnalysisService,

        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },
    ) {}

    @Post('analyze-dependencies')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    @ApiOperation({ summary: 'Analyze dependencies', description: 'Analyze code dependencies for a pull request' })
    @ApiResponse({ status: 200, description: 'Dependencies analyzed' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    async analyzeDependencies(
        @Body()
        body: {
            id: string;
            name: string;
            full_name: string;
            number: string;
            head: {
                ref: string;
            };
            base: {
                ref: string;
            };
            platform: string;
            teamId: string;
            filePaths?: string[];
        },
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { id, name, full_name, number, head, base, platform, teamId } =
            body;
        const { taskId } =
            await this.codeASTAnalysisService.initializeASTAnalysis(
                {
                    id,
                    name,
                    full_name,
                },
                {
                    number,
                    head,
                    base,
                },
                platform,
                {
                    organizationId: this.request.user?.organization.uuid,
                    teamId,
                },
                body.filePaths || [],
            );

        // Heavy task: linear backoff 5s, 10s, 15s... up to 60s
        await this.codeASTAnalysisService.awaitTask(
            taskId,
            {
                organizationId: this.request.user?.organization.uuid,
                teamId,
            },
            {
                timeout: 720000, // 12 minutes - AST analysis is a heavy task
                initialInterval: BackoffPresets.HEAVY_TASK.baseInterval,
                maxInterval: BackoffPresets.HEAVY_TASK.maxInterval,
                useExponentialBackoff: false, // Linear mode
            },
        );

        const result = taskId;

        // Converte o resultado para JSON
        const jsonString = JSON.stringify(result, replacer);

        // Gera um caminho de arquivo temporário
        const tempFilePath = join(__dirname, `temp-${uuidv4()}.json`);
        writeFileSync(tempFilePath, jsonString);

        // Define os cabeçalhos para a resposta
        res.set({
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="dependencies.json"',
        });

        // Cria um stream de leitura do arquivo temporário
        const fileStream = createReadStream(tempFilePath);

        // Após o stream ser fechado, deleta o arquivo temporário
        fileStream.on('close', () => {
            unlink(tempFilePath, (err) => {
                if (err) {
                    console.error('Error deleting temp file:', err);
                }
            });
        });

        return new StreamableFile(fileStream);
    }

    @Post('content-from-diff')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    async getRelatedContentFromDiff(
        @Body()
        body: {
            id: string;
            name: string;
            full_name: string;
            number: string;
            head: {
                ref: string;
            };
            base: {
                ref: string;
            };
            platform: string;
            teamId: string;
            diff: string;
            filePath: string;
            taskId: string;
        },
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const {
            id,
            name,
            full_name,
            number,
            head,
            base,
            platform,
            teamId,
            diff,
            filePath,
            taskId,
        } = body;

        const result =
            await this.codeASTAnalysisService.getRelatedContentFromDiff(
                {
                    id,
                    name,
                    full_name,
                },
                {
                    number,
                    head,
                    base,
                },
                platform,
                {
                    organizationId: this.request.user?.organization.uuid,
                    teamId,
                },
                diff,
                filePath,
                taskId,
            );

        // O resultado já é uma string regular
        const tempFilePath = join(__dirname, `temp-${uuidv4()}.txt`);
        writeFileSync(tempFilePath, result.content);

        // Define os cabeçalhos para a resposta
        res.set({
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="related-content.txt"',
        });

        // Cria um stream de leitura do arquivo temporário
        const fileStream = createReadStream(tempFilePath);

        // Após o stream ser fechado, deleta o arquivo temporário
        fileStream.on('close', () => {
            unlink(tempFilePath, (err) => {
                if (err) {
                    console.error('Error deleting temp file:', err);
                }
            });
        });

        return new StreamableFile(fileStream);
    }
}
