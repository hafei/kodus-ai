import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateIssuePropertyDto {
    @ApiProperty({
        description: 'Field to update',
        enum: ['severity', 'label', 'status'],
        example: 'status'
    })
    @IsString()
    @IsIn(['severity', 'label', 'status'])
    field: 'severity' | 'label' | 'status';

    @ApiProperty({ description: 'New value for the field', example: 'resolved' })
    @IsString()
    value: string;
}
