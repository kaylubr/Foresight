import type { ReactNode } from "react";
import type { RepoConnectResult } from "../../../../shared/types";
import { factRows, refGroups } from "../../lib/repoSummary";
import { STATUS_LEGEND, statusWord } from "../../lib/statusCodes";
import InfoTip from "../InfoTip";

function FactsTable({ children }: { children: ReactNode }) {
  return <div className="state-table">{children}</div>;
}

function Row({ label, value, full }: { label: string; value: ReactNode; full?: string }) {
  return (
    <div className="state-row" title={full}>
      <span className="key">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function List({ title, tip, children }: { title: string; tip?: string; children: ReactNode }) {
  return (
    <div className="repo-list">
      <div className="repo-list-head">
        <h3 className="repo-list-title">{title}</h3>
        {tip ? (
          <InfoTip label={tip} align="start">
            {tip}
          </InfoTip>
        ) : null}
      </div>
      <div className="repo-list-body">{children}</div>
    </div>
  );
}

function parseEntry(entry: string): { code: string; path: string } {
  const at = entry.indexOf("\t");
  return at === -1
    ? { code: entry, path: entry }
    : { code: entry.slice(0, at), path: entry.slice(at + 1) };
}

function StatusValue({ code }: { code: string }) {
  const word = statusWord(code);
  return (
    <>
      <span className="repo-code">{code}</span>
      {word ? <span className="repo-word"> {word}</span> : null}
    </>
  );
}

function Changes({ entries }: { entries: string[] }) {
  return (
    <FactsTable>
      {entries.map((entry) => {
        const { code, path } = parseEntry(entry);
        return <Row key={entry} label={path} value={<StatusValue code={code} />} />;
      })}
    </FactsTable>
  );
}

export default function RepoFacts({ repo }: { repo: RepoConnectResult }) {
  const { stagedEntries, worktreeEntries } = repo.state;

  return (
    <>
      <FactsTable>
        {factRows(repo).map((fact) => (
          <Row key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </FactsTable>

      <List title="Refs">
        {refGroups(repo).map((group) => (
          <div className="repo-group" key={group.label}>
            <h4 className="repo-subhead">{group.label}</h4>
            <FactsTable>
              {group.rows.map((row) => (
                <Row key={row.full} label={row.name} value={row.target} full={row.full} />
              ))}
            </FactsTable>
          </div>
        ))}
      </List>

      {stagedEntries.length > 0 ? (
        <List title="Staged" tip={STATUS_LEGEND}>
          <Changes entries={stagedEntries} />
        </List>
      ) : null}

      {worktreeEntries.length > 0 ? (
        <List title="Working directory" tip={STATUS_LEGEND}>
          <Changes entries={worktreeEntries} />
        </List>
      ) : null}
    </>
  );
}
