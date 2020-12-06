import { sayHello } from '../functions/hello';

test('says hello', () => {
  expect(sayHello('Sample')).toBe('Hello Sample!');
});

// test('return proper response', () => {
//   const expectedResponse = {
//     statusCode: 200,
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       error: {},
//       data: {},
//     }),
//   };
//   // expect();
// });
