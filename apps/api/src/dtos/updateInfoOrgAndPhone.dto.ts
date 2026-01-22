import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInfoOrganizationAndPhoneDto {
    @ApiProperty({ description: 'User full name', example: 'Alice Johnson' })
    @IsString()
    @IsNotEmpty({ message: 'The name field is required.' })
    public name: string;

    @ApiProperty({ description: 'Phone number', example: '+1-555-1234', required: false })
    @IsString()
    @IsOptional()
    public phone?: string;
}
