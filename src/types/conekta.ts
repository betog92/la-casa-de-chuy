/**
 * Tipos para la integración de Conekta
 */

export interface ConektaTokenResponse {
  id: string;
}

export interface ConektaErrorResponse {
  type: string;
  message: string;
  message_to_purchaser?: string;
  param?: string;
}

export interface ConektaTokenParams {
  card: {
    number: string;
    name: string;
    exp_year: string;
    exp_month: string;
    cvc: string;
    address?: {
      street1?: string;
      city?: string;
      state?: string;
      country?: string;
      postal_code?: string;
    };
  };
}

export interface ConektaAPI {
  setPublicKey: (key: string) => void;
  Token: {
    create: (
      params: ConektaTokenParams,
      successCallback: (response: ConektaTokenResponse) => void,
      errorCallback: (error: ConektaErrorResponse) => void
    ) => void;
  };
}

declare global {
  interface Window {
    Conekta?: ConektaAPI;
    conekta_antifraud_config_jsonp?: () => void;
  }
}
