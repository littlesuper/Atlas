import pino from 'pino';

export const REDACTED = '[REDACTED]';

export const sensitiveLogPaths = [
  'password',
  '*.password',
  'context.password',
  'body.password',
  'req.body.password',
  'token',
  '*.token',
  'context.token',
  'query.token',
  'req.query.token',
  'accessToken',
  '*.accessToken',
  'body.accessToken',
  'refreshToken',
  '*.refreshToken',
  'body.refreshToken',
  'authorization',
  'headers.authorization',
  'req.headers.authorization',
  'cookie',
  'headers.cookie',
  'req.headers.cookie',
  'set-cookie',
  'headers.set-cookie',
  'req.headers.set-cookie',
];

interface CreateLoggerOptions {
  level?: string;
  isProduction?: boolean;
  isTest?: boolean;
  pretty?: boolean;
}

export const createLogger = (destination?: pino.DestinationStream, options: CreateLoggerOptions = {}) => {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  const isTest = options.isTest ?? process.env.NODE_ENV === 'test';
  const pretty = options.pretty ?? (!isProduction && !isTest);

  const loggerOptions: pino.LoggerOptions = {
    level: options.level || (isTest ? 'silent' : process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')),
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    redact: {
      paths: sensitiveLogPaths,
      censor: REDACTED,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
            messageKey: 'message',
          },
        }
      : undefined,
    serializers: {
      err: pino.stdSerializers.err,
      req: (req) => ({
        method: req.method,
        url: req.url,
        trace_id: req.id,
        requestId: req.id,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  };

  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
};

export const logger = createLogger();

export type Logger = typeof logger;
