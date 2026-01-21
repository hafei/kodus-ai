import { ApiProperty } from '@nestjs/swagger';

export class JiraAccessTokenDTO {
    @ApiProperty({ description: 'code', example: 'code_example' })
    code: string;
}
