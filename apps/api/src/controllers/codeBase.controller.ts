
import {
    Controller,
    Inject,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';








function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return [...value.entries()];
    }
    return value;
}

@Controller('code-base')
export class CodeBaseController {
    constructor(
        @Inject(REQUEST)
        private readonly request: Request & {
            user: { organization: { uuid: string } };
        },
    ) {}
}
