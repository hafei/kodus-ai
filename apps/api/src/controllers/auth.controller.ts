import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
    ApiQuery,
    ApiParam,
} from '@nestjs/swagger';

import { ConfirmEmailUseCase } from '@libs/identity/application/use-cases/auth/confirm-email.use-case';
import { ForgotPasswordUseCase } from '@libs/identity/application/use-cases/auth/forgotPasswordUseCase';
import { LoginUseCase } from '@libs/identity/application/use-cases/auth/login.use-case';
import { LogoutUseCase } from '@libs/identity/application/use-cases/auth/logout.use-case';
import { OAuthLoginUseCase } from '@libs/identity/application/use-cases/auth/oauth-login.use-case';
import { RefreshTokenUseCase } from '@libs/identity/application/use-cases/auth/refresh-toke.use-case';
import { ResendEmailUseCase } from '@libs/identity/application/use-cases/auth/resend-email.use-case';
import { ResetPasswordUseCase } from '@libs/identity/application/use-cases/auth/resetPasswordUseCase';
import { SignUpUseCase } from '@libs/identity/application/use-cases/auth/signup.use-case';

import { CreateUserOrganizationOAuthDto } from '../dtos/create-user-organization-oauth.dto';
import { SignUpDTO } from '@libs/identity/dtos/create-user-organization.dto';
import { AuthGuard } from '@nestjs/passport';
import { SSOLoginUseCase } from '@libs/identity/application/use-cases/auth/sso-login.use-case';
import { SSOCheckUseCase } from '@libs/identity/application/use-cases/auth/sso-check.use-case';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly loginUseCase: LoginUseCase,
        private readonly refreshTokenUseCase: RefreshTokenUseCase,
        private readonly logoutUseCase: LogoutUseCase,
        private readonly signUpUseCase: SignUpUseCase,
        private readonly oAuthLoginUseCase: OAuthLoginUseCase,
        private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
        private readonly resetPasswordUseCase: ResetPasswordUseCase,
        private readonly confirmEmailUseCase: ConfirmEmailUseCase,
        private readonly resendEmailUseCase: ResendEmailUseCase,
        private readonly ssoLoginUseCase: SSOLoginUseCase,
        private readonly ssoCheckUseCase: SSOCheckUseCase,
    ) {}

    @Post('login')
    @ApiOperation({ summary: 'User login', description: 'Authenticate user with email and password' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                email: { type: 'string', example: 'user@example.com' },
                password: { type: 'string', example: 'password123' },
            },
        },
    })
    async login(@Body() body: { email: string; password: string }) {
        return await this.loginUseCase.execute(body.email, body.password);
    }

    @Post('logout')
    @ApiOperation({ summary: 'User logout', description: 'Logout user and invalidate refresh token' })
    @ApiResponse({ status: 200, description: 'Logout successful' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                refreshToken: { type: 'string', example: 'refresh_token_here' },
            },
        },
    })
    async logout(@Body() body: { refreshToken: string }) {
        return await this.logoutUseCase.execute(body.refreshToken);
    }

    @Post('refresh')
    @ApiOperation({ summary: 'Refresh access token', description: 'Get new access token using refresh token' })
    @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid refresh token' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                refreshToken: { type: 'string', example: 'refresh_token_here' },
            },
        },
    })
    async refresh(@Body() body: { refreshToken: string }) {
        return await this.refreshTokenUseCase.execute(body.refreshToken);
    }

    @Post('signUp')
    @ApiOperation({ summary: 'User registration', description: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async signUp(@Body() body: SignUpDTO) {
        return await this.signUpUseCase.execute(body);
    }

    @Post('forgot-password')
    @ApiOperation({ summary: 'Request password reset', description: 'Send password reset email' })
    @ApiResponse({ status: 200, description: 'Reset email sent' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                email: { type: 'string', example: 'user@example.com' },
            },
        },
    })
    async forgotPassword(@Body() body: { email: string }) {
        return await this.forgotPasswordUseCase.execute(body.email);
    }
    @Post('reset-password')
    @ApiOperation({ summary: 'Reset password', description: 'Reset password using token from email' })
    @ApiResponse({ status: 200, description: 'Password reset successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired token' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                token: { type: 'string', example: 'reset_token_here' },
                newPassword: { type: 'string', example: 'newPassword123' },
            },
        },
    })
    async resetPassword(@Body() body: { token: string; newPassword: string }) {
        return await this.resetPasswordUseCase.execute(
            body.token,
            body.newPassword,
        );
    }

    @Post('confirm-email')
    @ApiOperation({ summary: 'Confirm email', description: 'Confirm user email address' })
    @ApiResponse({ status: 200, description: 'Email confirmed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired token' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                token: { type: 'string', example: 'confirm_token_here' },
            },
        },
    })
    async confirmEmail(@Body() body: { token: string }) {
        return await this.confirmEmailUseCase.execute(body.token);
    }

    @Post('resend-email')
    @ApiOperation({ summary: 'Resend confirmation email', description: 'Resend email confirmation link' })
    @ApiResponse({ status: 200, description: 'Email resent successfully' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                email: { type: 'string', example: 'user@example.com' },
            },
        },
    })
    async resendEmail(@Body() body: { email: string }) {
        return await this.resendEmailUseCase.execute(body.email);
    }

    @Post('oauth')
    @ApiOperation({ summary: 'OAuth login', description: 'Authenticate using OAuth provider' })
    @ApiResponse({ status: 200, description: 'OAuth login successful' })
    @ApiResponse({ status: 401, description: 'Invalid OAuth credentials' })
    async oAuth(@Body() body: CreateUserOrganizationOAuthDto) {
        const { name, email, refreshToken, authProvider } = body;

        return await this.oAuthLoginUseCase.execute(
            name,
            email,
            refreshToken,
            authProvider,
        );
    }

    @Get('sso/check')
    @ApiOperation({ summary: 'Check SSO configuration', description: 'Check if organization has SSO enabled' })
    @ApiResponse({ status: 200, description: 'SSO configuration status' })
    @ApiQuery({ name: 'domain', type: 'string', example: 'company.kodus.io' })
    async checkSSO(@Query('domain') domain: string) {
        return await this.ssoCheckUseCase.execute(domain);
    }

    @Get('sso/login/:organizationId')
    @UseGuards(AuthGuard('saml'))
    @ApiOperation({ summary: 'Initiate SAML SSO login', description: 'Redirect to SAML identity provider' })
    @ApiResponse({ status: 200, description: 'SSO initiated' })
    @ApiParam({ name: 'organizationId', type: 'string', example: 'org_123abc' })
    async ssoLogin() {
        // Handled in the guard
    }

    @Post('sso/saml/callback/:organizationId')
    @UseGuards(AuthGuard('saml'))
    @ApiOperation({ summary: 'SAML SSO callback', description: 'Handle SAML authentication response' })
    @ApiResponse({ status: 200, description: 'SSO authentication successful' })
    @ApiResponse({ status: 302, description: 'Redirect to frontend' })
    @ApiParam({ name: 'organizationId', type: 'string', example: 'org_123abc' })
    async ssoCallback(
        @Req() req: Request,
        @Res() res: Response,
        @Param('organizationId') organizationId: string,
    ) {
        const { accessToken, refreshToken } =
            await this.ssoLoginUseCase.execute(req.user, organizationId);

        const frontendUrl = process.env.API_FRONTEND_URL;

        if (!frontendUrl) {
            throw new Error('Frontend URL not found');
        }

        const payload = JSON.stringify({ accessToken, refreshToken });

        res.cookie('sso_handoff', payload, {
            httpOnly: false,
            secure: process.env.API_NODE_ENV !== 'development',
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 1000,
            domain:
                process.env.API_NODE_ENV !== 'development'
                    ? '.kodus.io'
                    : undefined,
        });

        return res.redirect(`${frontendUrl}/sso-callback`);
    }
}
