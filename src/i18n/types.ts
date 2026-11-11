import type { en } from "./catalog/en";

export type Messages<Source> = { readonly [Key in keyof Source]: string };

export type Catalog = { readonly [Namespace in keyof typeof en]: Messages<(typeof en)[Namespace]> };

type Keys<Namespace extends keyof typeof en> = Extract<keyof (typeof en)[Namespace], string>;

type AllKeys = { [Namespace in keyof typeof en]: `${Namespace}.${Keys<Namespace>}` }[keyof typeof en];

/** A counted message is stored as `<key>_one` and `<key>_other`. */
export type PluralKey = AllKeys extends infer Key
  ? Key extends `${infer Base}_other` ? Base : never
  : never;

export type MessageKey = AllKeys;

export type MessageParams = Readonly<Record<string, string | number>>;
