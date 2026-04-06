import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ token: string; userId: string; keySalt: string }> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(password, 12);
    const keySalt = randomBytes(16).toString('base64');
    const user = this.userRepo.create({ email, passwordHash, keySalt });
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, userId: user.id, keySalt };
  }

  async login(email: string, password: string): Promise<{ token: string; userId: string; keySalt: string }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.keySalt) {
      user.keySalt = randomBytes(16).toString('base64');
      await this.userRepo.save(user);
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, userId: user.id, keySalt: user.keySalt };
  }

  async validateToken(token: string): Promise<{ userId: string; email: string }> {
    try {
      const payload = this.jwtService.verify(token);
      return { userId: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
