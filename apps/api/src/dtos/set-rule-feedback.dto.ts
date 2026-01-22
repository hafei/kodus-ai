import { RuleFeedbackType } from '@libs/kodyRules/domain/entities/ruleLike.entity';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetRuleFeedbackDto {
    @IsNotEmpty()
    @IsEnum(RuleFeedbackType, {
        message: 'feedback must be either "positive" or "negative"',
    })
    @ApiProperty({
        description: 'User feedback on the rule (positive or negative)',
        example: 'positive',
    })
    feedback: RuleFeedbackType;
}
