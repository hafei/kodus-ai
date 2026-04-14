import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RepositoryModel } from '../infrastructure/adapters/repositories/schemas/repository.model';
import { AstNodeModel } from '../infrastructure/adapters/repositories/schemas/astNode.model';
import { AstEdgeModel } from '../infrastructure/adapters/repositories/schemas/astEdge.model';

import { RepositoryRepository } from '../infrastructure/adapters/repositories/repository.repository';
import { AstGraphRepository } from '../infrastructure/adapters/repositories/astGraph.repository';
import { KodusGraphCli } from '../infrastructure/adapters/services/graph/kodus-graph-cli';
import { GraphIndexerService } from '../infrastructure/adapters/services/graph/graph-indexer.service';
import { GraphContextService } from '../infrastructure/adapters/services/graph/graph-context.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([RepositoryModel, AstNodeModel, AstEdgeModel]),
    ],
    providers: [
        RepositoryRepository,
        AstGraphRepository,
        KodusGraphCli,
        GraphIndexerService,
        GraphContextService,
    ],
    exports: [
        RepositoryRepository,
        AstGraphRepository,
        KodusGraphCli,
        GraphIndexerService,
        GraphContextService,
    ],
})
export class AstGraphModule {}
