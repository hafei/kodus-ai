import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInfoOrganizationAndPhoneDto {
    @ApiProperty({ description: 'name', example: 'name_example' })
    @IsString()
    @IsNotEmpty({ message: 'The name field is required.' })
    public name: string;

    @ApiProperty({ description: 'phone', example: 'phone_example', required: false })
    @IsString()
    @IsOptional()
    public phone?: string;
}
