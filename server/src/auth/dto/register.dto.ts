import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString({ message: '密码必须是字符串' })
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(128, { message: '密码不能超过 128 位' })
  password!: string;
}
