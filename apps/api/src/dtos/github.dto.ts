import { ApiProperty } from '@nestjs/swagger';
export interface GithubAccessTokenDTO {
    @ApiProperty({ description: 'code', example: 'code_example' })
    code: string;
}
