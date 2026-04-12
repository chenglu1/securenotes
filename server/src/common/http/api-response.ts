export interface ApiSuccessResponse<T> {
  code: 0;
  message: string;
  data: T;
  timestamp: string;
}

export function ok<T>(data: T, message = 'OK'): ApiSuccessResponse<T> {
  return {
    code: 0,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}