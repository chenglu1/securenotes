import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ token: string; userId: string }> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.userRepo.create({ email, passwordHash });
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, userId: user.id };
  }

  async login(email: string, password: string): Promise<{ token: string; userId: string }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token, userId: user.id };
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
