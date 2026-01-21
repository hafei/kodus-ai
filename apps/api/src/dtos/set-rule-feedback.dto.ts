import { RuleFeedbackType } from '@libs/kodyRules/domain/entities/ruleLike.entity';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetRuleFeedbackDto {
        @ApiProperty({ description: 'message', example: 'message_example' })
    @IsNotEmpty()
    @IsEnum(RuleFeedbackType, {
        message: 'feedback must be either "positive" or "negative"',
    })
    @ApiProperty({ description: 'feedback', example: 'feedback_example' })
    feedback: RuleFeedbackType;
}
