import React, { useState } from 'react';
import { Banknote, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useLanguage } from './context/LanguageContext';

const money = n => `PKR ${n.toLocaleString('en-PK')}`;
const dateLabel = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));

export default function IncomePage({ income, search = "", setModal }) {
  const { t } = useLanguage();
  const [localSearch, setLocalSearch] = useState(search);
  const effectiveSearch = localSearch || search;
  const query = effectiveSearch.trim().toLowerCase();
  const filtered = income.filter(item => !query || Object.values(item).join(' ').toLowerCase().includes(query));
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Banknote size={15} /> {t("station_management", "STATION MANAGEMENT")}
          </div>
          <h1>{t("income_title", "Other income")}</h1>
          <p>{t("income_desc", "Track revenue outside of fuel sales")}</p>
        </div>
        <button className="button primary" onClick={() => setModal('income')}>
          <Plus size={18} /> {t("add_income", "Add income")}
        </button>
      </div>

      <div className="expense-summary-strip">
        <div>
          <span>{t("matching_income", "Matching income")}</span>
          <strong className="expense-total">{money(total)}</strong>
        </div>
        <div>
          <span>{t("matching_records", "Matching records")}</span>
          <strong className="expense-count">{filtered.length}</strong>
        </div>
      </div>

      <div className="card table-page">
        <div className="table-toolbar">
          <div>
            <h2>{t("income_register", "Other income register")}</h2>
            <p>{t("income_register_desc", "Filter records or select a row to view details.")}</p>
          </div>
          <div className="table-search search">
            <Search size={15} />
            <input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={t("search_income", "Search other income")}
            />
          </div>
        </div>

        <div className="table-wrap desktop-table-only">
          <table>
            <thead>
              <tr>
                {[
                  t("col_source", "Income source"),
                  t("col_category", "Category"),
                  t("col_date", "Date"),
                  t("col_amount", "Amount"),
                  t("col_status", "Status"),
                  ""
                ].map((h, idx) => (
                  <th key={idx}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  className="clickable-row"
                  key={item.id}
                  onClick={() => setModal({ type: 'incomeDetail', income: item })}
                >
                  <td><strong className="row-title">{item.name}</strong></td>
                  <td>{item.category}</td>
                  <td>{dateLabel(item.date)}</td>
                  <td>{money(item.amount)}</td>
                  <td><span className="status success">{item.status}</span></td>
                  <td>
                    <button
                      className="more"
                      aria-label={`View ${item.name} details`}
                      onClick={event => {
                        event.stopPropagation();
                        setModal({ type: 'incomeDetail', income: item });
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-cards-only">
          {filtered.map(item => (
            <div
              key={item.id}
              className="mobile-record-card clickable"
              onClick={() => setModal({ type: 'incomeDetail', income: item })}
            >
              <div className="mobile-record-header">
                <strong className="row-title">{item.name}</strong>
                <span className="status success">{item.status}</span>
              </div>
              <div className="mobile-record-body">
                <div className="mobile-record-field">
                  <span>{t("col_category", "Category")}</span>
                  <b>{item.category}</b>
                </div>
                <div className="mobile-record-field">
                  <span>{t("col_date", "Date")}</span>
                  <small>{dateLabel(item.date)}</small>
                </div>
                <div className="mobile-record-field">
                  <span>{t("col_amount", "Amount")}</span>
                  <b style={{ color: '#16a34a' }}>{money(item.amount)}</b>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!filtered.length && <p className="empty-state">{t("no_income", "No other income matches your search.")}</p>}
      </div>
    </>
  );
}
