import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 设置全局 API 前缀
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true, // 额外字段直接返回 400，而非静默丢弃
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`SecureNotes server running on http://localhost:${port}`);
}
bootstrap();
