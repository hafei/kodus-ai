import { ApiProperty } from '@nestjs/swagger';

export class GithubAccessTokenDTO {
    @ApiProperty({ description: 'GitHub OAuth authorization code', example: 'AUTHORIZATION_CODE_456' })
    code: string;
}
