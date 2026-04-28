import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ActorsService } from './actors.service';
import { CreateActorDto } from './dto/create-actor.dto';
import { UpdateActorDto } from './dto/update-actor.dto';
import { ActorsQueryDto } from './dto/actors-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('actors')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('actors')
export class ActorsController {
  constructor(private readonly actorsService: ActorsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a supply chain actor' })
  @ApiResponse({ status: 201, description: 'Actor created' })
  create(@Body() dto: CreateActorDto) {
    return this.actorsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all actors (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated actor list' })
  findAll(@Query() query: ActorsQueryDto) {
    return this.actorsService.findAll(query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an actor by ID' })
  @ApiResponse({ status: 200, description: 'Actor found' })
  @ApiResponse({ status: 404, description: 'Actor not found' })
  findOne(@Param('id') id: string) {
    return this.actorsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an actor' })
  @ApiResponse({ status: 200, description: 'Actor updated' })
  @ApiResponse({ status: 404, description: 'Actor not found' })
  update(@Param('id') id: string, @Body() dto: UpdateActorDto) {
    return this.actorsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an actor' })
  @ApiResponse({ status: 200, description: 'Actor deleted' })
  @ApiResponse({ status: 404, description: 'Actor not found' })
  remove(@Param('id') id: string) {
    return this.actorsService.remove(id);
  }
}
