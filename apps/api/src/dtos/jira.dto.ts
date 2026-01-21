import { ApiProperty } from '@nestjs/swagger';
export interface JiraAccessTokenDTO {
    @ApiProperty({ description: 'code', example: 'code_example' })
    code: string;
}
