import { Request, Response, NextFunction } from 'express';
import { type ZodType, ZodError } from 'zod';

interface ValidateOptions {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Zod 校验中间件
 * 用法: router.post('/login', validate({ body: loginSchema }), handler)
 */
export const validate = (schemas: ValidateOptions) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        });
        res.status(400).json({
          error: '请求参数校验失败',
          details: messages,
        });
        return;
      }
      next(error);
    }
  };
};
