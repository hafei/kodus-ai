import { Body, Controller, Delete, Inject, Param, Post } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiSecurity,
} from '@nestjs/swagger';

import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import { SetRuleFeedbackDto } from '../dtos/set-rule-feedback.dto';
import { SetRuleLikeUseCase } from '../../../../libs/kodyRules/application/use-cases/rule-like/set-rule-like.use-case';
import { RemoveRuleLikeUseCase } from '../../../../libs/kodyRules/application/use-cases/rule-like/remove-rule-like.use-case';

@ApiTags('Rule Like')
@ApiSecurity('Bearer', [])
@Controller('rule-like')
export class RuleLikeController {
    constructor(
        private readonly setRuleLikeUseCase: SetRuleLikeUseCase,
        private readonly removeRuleLikeUseCase: RemoveRuleLikeUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Post(':ruleId/feedback')
    @ApiOperation({ summary: 'Set rule feedback', description: 'Like or provide feedback for a Kody rule' })
    @ApiResponse({ status: 200, description: 'Feedback set successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiParam({ name: 'ruleId', type: 'string', example: 'rule_abc123' })
    async setFeedback(
        @Param('ruleId') ruleId: string,
        @Body() body: SetRuleFeedbackDto,
    ) {
        if (!this.request.user?.uuid) {
            throw new Error('User not authenticated');
        }

        return this.setRuleLikeUseCase.execute(
            ruleId,
            body.feedback,
            this.request.user.uuid,
        );
    }

    @Delete(':ruleId/feedback')
    @ApiOperation({ summary: 'Remove rule feedback', description: 'Remove like/feedback for a Kody rule' })
    @ApiResponse({ status: 200, description: 'Feedback removed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiParam({ name: 'ruleId', type: 'string', example: 'rule_abc123' })
    async removeFeedback(@Param('ruleId') ruleId: string) {
        if (!this.request.user?.uuid) {
            throw new Error('User not authenticated');
        }

        return this.removeRuleLikeUseCase.execute(
            ruleId,
            this.request.user.uuid,
        );
    }
}
