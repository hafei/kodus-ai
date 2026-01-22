import { Body, Controller, Post } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
} from '@nestjs/swagger';

import { TrackUseCase } from '@libs/analytics/application/use-cases/segment/track.use-case';

@ApiTags('Segment')
@Controller('segment')
export class SegmentController {
    constructor(private readonly trackUseCase: TrackUseCase) {}

    @Post('/track')
    @ApiOperation({ summary: 'Track event', description: 'Track analytics events via Segment' })
    @ApiResponse({ status: 200, description: 'Event tracked successfully' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                event: { type: 'string', example: 'page_view' },
                userId: { type: 'string', example: 'user_123' },
                properties: { type: 'object' },
            },
        },
    })
    public async track(@Body() body: any) {
        return this.trackUseCase.execute(body);
    }
}
