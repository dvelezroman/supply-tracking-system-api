import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type SafeUser = Omit<Prisma.UserGetPayload<object>, 'password'>;

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findById(id: string) {
    return this.usersRepository.findById(id);
  }

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  create(data: Prisma.UserCreateInput) {
    return this.usersRepository.create(data);
  }

  async findAll(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.usersRepository.findAll({ skip, take: limit }),
      this.usersRepository.count(),
    ]);
    return { items, total, page, limit };
  }

  async findOneSafe(id: string): Promise<SafeUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async createUser(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepository.create({
      email: dto.email,
      name: dto.name,
      password: hashed,
      role: dto.role ?? 'VIEWER',
      ...(dto.actorId
        ? { actor: { connect: { id: dto.actorId } } }
        : {}),
    });
    return this.sanitize(user);
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    const current = await this.usersRepository.findById(id);
    if (!current) throw new NotFoundException('User not found');

    if (dto.email !== undefined && dto.email !== current.email) {
      const taken = await this.findByEmail(dto.email);
      if (taken) throw new ConflictException('Email already in use');
    }

    const data: Prisma.UserUpdateInput = {};

    if (dto.email !== undefined) data.email = dto.email;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;

    if (dto.password && dto.password.length > 0) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.actorId !== undefined) {
      if (dto.actorId === null) {
        data.actor = { disconnect: true };
      } else {
        data.actor = { connect: { id: dto.actorId } };
      }
    }

    if (Object.keys(data).length === 0) {
      return this.sanitize(current);
    }

    const updated = await this.usersRepository.update(id, data);
    return this.sanitize(updated);
  }

  private sanitize(user: { password: string } & SafeUser): SafeUser {
    const { password: _p, ...rest } = user;
    return rest;
  }
}
