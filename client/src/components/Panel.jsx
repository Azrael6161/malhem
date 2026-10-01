import React from 'react';

/** Обёртка панели с заголовком. */
export default function Panel({ title, children, right }) {
  return (
    <div className="panel">
      {title && (
        <div className="panel-head">
          <h3>{title}</h3>
          {right}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </div>
  );
}
