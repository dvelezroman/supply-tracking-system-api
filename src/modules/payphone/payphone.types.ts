export type PayphoneConfirmRequest = {
  id: number;
  clientTxId: string;
};

export type PayphoneConfirmResponse = {
  email?: string;
  cardType?: string;
  bin?: string;
  lastDigits?: string;
  deferredCode?: string;
  deferred?: boolean;
  cardBrandCode?: string;
  cardBrand?: string;
  amount?: number;
  clientTransactionId?: string;
  phoneNumber?: string;
  statusCode?: number;
  transactionStatus?: string;
  authorizationCode?: string;
  message?: string | null;
  messageCode?: number;
  transactionId?: number;
  document?: string;
  currency?: string;
  optionalParameter3?: string;
  optionalParameter4?: string;
  storeName?: string;
  date?: string;
  regionIso?: string;
  transactionType?: string;
  reference?: string;
  errorCode?: number;
};

export type PayphoneBoxConfig = {
  token: string;
  storeId: string;
  clientTransactionId: string;
  amount: number;
  amountWithTax: number;
  amountWithoutTax: number;
  tax: number;
  service: number;
  tip: number;
  currency: string;
  reference: string;
  lang: string;
  defaultMethod: 'card';
  timeZone: number;
  lat?: string;
  lng?: string;
  email?: string;
  phoneNumber?: string;
  optionalParameter?: string;
};
