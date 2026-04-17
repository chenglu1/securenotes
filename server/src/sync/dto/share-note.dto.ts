import { IsEmail, IsString, MinLength } from 'class-validator';

export class ShareNoteDto {
  @IsString({ message: 'email 必须是字符串' })
  @MinLength(1, { message: 'email 不能为空' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email!: string;
}