import { formatPKR } from './formatters.js';

export const money = v => formatPKR(v);

export const STATUS_TONE = {
  DRAFT: 'info',
  APPROVED: 'warning',
  REJECTED: 'danger',
  FINALIZED: 'success',
};

export const PAYMENT_TONE = {
  UNPAID: 'danger',
  PARTIAL: 'warning',
  PAID: 'success',
};

export const METHOD_LABEL = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  mobile_wallet: 'Mobile wallet',
};

export const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : '');
export const fmtDateTime = iso => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' }) : '');

// Today in Pakistan (YYYY-MM-DD), used as the default payment date and the date input's max.
export const karachiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

export const SKIP_REASONS = {
  NO_SALARY: 'no monthly salary set',
  NOT_JOINED_YET: 'joins after this month',
  ALREADY_APPROVED: 'already approved',
  ALREADY_FINALIZED: 'already finalized',
};
