import { ApiProperty } from '@nestjs/swagger';

export class JiraAccessTokenDTO {
    @ApiProperty({ description: 'Jira OAuth authorization code', example: 'AUTHORIZATION_CODE_123' })
    code: string;
}
