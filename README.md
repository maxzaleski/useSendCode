# useSendCode

A React (NextJS-oriented) hook that facilitates operations such as sending one-time codes.

## Table of Contents

- [useSendCode](#usesendcode)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Motivation](#motivation)
    - [Caveat](#caveat)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Configuration](#configuration)
    - [Properties](#properties)
  - [Understanding the hook's behaviour](#understanding-the-hooks-behaviour)
    - [When a user clicks on the CTA](#when-a-user-clicks-on-the-cta)
    - [When the cooldown is active, but the user refreshes the page](#when-the-cooldown-is-active-but-the-user-refreshes-the-page)
    - [When the cooldown period is over](#when-the-cooldown-period-is-over)
  - [TypeScript Support](#typescript-support)
  - [License](#license)

---

## Features

- Handle spam-sensitive operations such as one-time codes
- Session tracking through server-only cookie
- Session recovery on reload
- Component (button) props that handle every aspect of the user-facing CTA (label, disabled, loading, etc)

## Motivation

Low-cost solution to spam-sensitive operations. This solution omits the use of a cache which might not always be available in early-stage applications.

### Caveat

This solution was designed around the ability to retrieve server-only cookies with relative ease, e.g. NextJS' `getServerSideProps`. A vanilla React application would not be suitable for this solution.

## Installation

Install through your package manager of choice (npm, yarn, etc)

```
npm -i @mzaleski/use-send-code
```

```
yarn add @mzaleski/use-send-code
```

## Usage

Example usage with NextJS' `getServerSideProps`:

```tsx
import { useSendCode } from '@mzaleski/use-send-code';

async function worker(iamIdentifier: string): Promise<void> { ... }

function Page(props) {
  const { sendCode, status, buttonProps } = useSendCode(worker, {
    iamIdentifier: 'some-id',
    lastCodeIdentifier: props.cookiePayload?.iamIdentifier,
    lastCodeSendAt: props.cookiePayload?.sentAt,
    callOnMount: true,
    cooldownPeriod: 2 * 60,
    buttonPropsActiveLabel: 'Recover my account',
    buttonPropsLoadingPropName: 'isLoading',
    debugStatements: process.env.NODE_ENV === 'development',
    sessionClearHandler: async () => { ... },
    sessionPersistHandler: async (iamIdentifier) => { ... },
  });

  const sendRecoveryCode = async () => {
    try {
      // You may wish to include additional logic here
      await sendCode();
    } catch (err: any) {
      // handle error
      console.error(err);
    }
  };

  return (
    <button {...buttonProps} onClick={sendRecoveryCode}>
      {buttonProps.label}
    </button>
  );
}

export async function getServerSideProps(context) {
  return {
    props: {
      cookiePayload: /** retrieve server-only cookie and deserialise it */,
    },
  };
}
```

An interactive example can be found on [Stackblitz](https://stackblitz.com/edit/nextjs-qlxy3n?file=README.md).

### Configuration

The hook's configuration is done through the `opts` object which has the following properties:

| Name | Type | Description | Default |
| --- | --- | --- | --- |
iamIdentifier | String | The current user's unique identifier | [required] |
sessionClearHandler | Function | A function responsible for clearing the server-only cookie | [required] |
sessionPersistHandler | Function | - A function responsible for creating the server-only cookie; it is given the `iamIdentifier` as parameter - The signature encourages the return of a server timestamp | [required] |
lastCodeIdentifier? | String | [retrieved from server-only cookie] the last code's `iamIdentifier` | `undefined` |
lastCodeSendAt? | String | [retrieved from server-only cookie] when the last code was sent; it will be parsed by the Javascript `Date` class | `undefined` |
callOnMount? | Boolean | Whether to call the worker on component mount | `false` |
cooldownPeriod? | Number | The cooldown period in seconds | `300` (5 minutes) |
buttonPropsActiveLabel? | String | The button's label when a new code is available | `"Send me a new code"` |
buttonPropsLoadingPropName? | String | [Custom component support] specify the `loading` boolean property name on a custom button component | `"loading"` |
debugStatements? | Boolean | Whether to log debug statements (requires development mode) | `false` |

### Properties

The hook returns an object with the following properties:

| Name | Type | Description |
| --- | --- | --- |
sendCode | Function | The function responsible for calling the worker and updating the internal state |
reset | Function | Will reset the hook to a `"READY"` state; this same function is called once the cooldown has expired |
status | String | The current status of the hook; it can be one of the following: `"READY"`, `"COOLDOWN"`, `"SENDING"`, `"RESTORING"` |
buttonProps | Object | The props that should be passed to the button component; affected by `buttonPropsActiveLabel`, `buttonPropsLoadingPropName` |

## Understanding the hook's behaviour 

### When a user clicks on the CTA

The hook will...

1. Call your worker and perform the operation
2. Call `sessionPersistHandler` with the given `iamIdentifier` to create a server-only cookie
3. Update its internal state as well the button's props in order to reflect the change 

### When the cooldown is active, but the user refreshes the page

The hook will restore the previous state by looking at `lastCodeIdentifier` and `lastCodeSendAt` from the server-only cookie.
   
### When the cooldown period is over

The hook will...

1. Call `sessionClearHandler` to clear the server-only cookie
2. Update its internal state as well the button's props in order to reflect the change

## TypeScript Support 

You will find a collection of typings bundled with the package.

## License

[MIT License](LICENSE) (c) 2022 Maximilien **Zaleski**