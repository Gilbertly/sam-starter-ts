import { APIGatewayEvent, Context } from 'aws-lambda';
import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN });

const sayHello = (message: string): string => {
  return message ? `Hello ${message}!` : 'Hello there!';
};

exports.handler = async (
  event: APIGatewayEvent,
  context: Context,
): Promise<string> => {
  context.callbackWaitsForEmptyEventLoop = false;
  const queryStrings = event.queryStringParameters || {};
  let eventParam = '';

  try {
    eventParam = queryStrings.message;
  } catch (error) {
    Sentry.captureException(error);
  }

  return sayHello(eventParam);
};

export { sayHello };
