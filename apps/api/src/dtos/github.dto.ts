import { ApiProperty } from '@nestjs/swagger';

export class GithubAccessTokenDTO {
    @ApiProperty({ description: 'code', example: 'code_example' })
    code: string;
}
