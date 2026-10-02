import {
  BuildQueryFilter,
  type FilteringQuery,
  type QuerySpecification,
  extractQueryFromParams,
} from '@nodewave/prisma-ezfilter';
import { AppError } from '../errors';

export interface ListSpec {
  /** Strict allowlist for filters / searchFilters / rangedFilters / orderKey. */
  allowedFields: string[];
  allowedRelations?: string[];
  defaultOrder: Record<string, 'asc' | 'desc'>;
  maxRows?: number;
}

export interface BuiltList {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown> | Record<string, unknown>[];
  skip: number;
  take: number;
  page: number;
  rows: number;
}

const invalid = (message: string, details?: unknown) =>
  new AppError(400, 'INVALID_QUERY', message, details);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Standard query contract (@nodewave/prisma-ezfilter):
 *   ?filters={"status":"TODO"}&searchFilters={"title":"login"}
 *   &rangedFilters=[{"key":"createdAt","start":"...Z","end":"...Z"}]
 *   &orderKey=createdAt&orderRule=desc&page=1&rows=10
 *
 * ezfilter only *warns* about unknown fields, so we enforce the allowlist ourselves.
 * That matters for security: a CLIENT must not be able to filter/sort by hidden columns
 * (e.g. `assignee.name`) and infer masked data from the result order.
 */
export function buildListQuery(
  params: Record<string, string>,
  spec: ListSpec,
  baseWhere: Record<string, unknown>,
): BuiltList {
  const raw = extractQueryFromParams(params);

  // extractQueryFromParams swallows JSON errors -> detect them.
  for (const key of ['filters', 'searchFilters', 'rangedFilters'] as const) {
    if (params[key] && raw[key] === undefined) throw invalid(`'${key}' must be valid JSON`);
  }
  if (raw.filters !== undefined && !isPlainObject(raw.filters))
    throw invalid("'filters' must be an object");
  if (raw.searchFilters !== undefined && !isPlainObject(raw.searchFilters)) {
    throw invalid("'searchFilters' must be an object");
  }
  if (raw.rangedFilters !== undefined && !Array.isArray(raw.rangedFilters)) {
    throw invalid("'rangedFilters' must be an array");
  }
  if (raw.orderRule && raw.orderRule !== 'asc' && raw.orderRule !== 'desc') {
    throw invalid("'orderRule' must be 'asc' or 'desc'");
  }
  if (Number.isNaN(raw.page) || Number.isNaN(raw.rows))
    throw invalid("'page' and 'rows' must be numbers");

  const used = [
    ...Object.keys(raw.filters ?? {}),
    ...Object.keys(raw.searchFilters ?? {}),
    ...(raw.rangedFilters ?? []).map((r) => r?.key),
    ...(raw.orderKey ? [raw.orderKey] : []),
  ];
  const rejected = used.filter((k) => typeof k !== 'string' || !spec.allowedFields.includes(k));
  if (rejected.length > 0) {
    throw invalid('Some fields cannot be used for filtering, searching or ordering', {
      rejected,
      allowed: spec.allowedFields,
    });
  }

  const filter: FilteringQuery = { ...raw };
  // ezfilter ignores `rows` when `page` is missing.
  if (filter.rows && !filter.page) filter.page = 1;

  const specification: QuerySpecification = {
    allowedFields: spec.allowedFields,
    allowedRelations: spec.allowedRelations ?? [],
    maxPageSize: spec.maxRows ?? 100,
    defaultSearchMode: 'insensitive',
  };
  const { query, validation } = new BuildQueryFilter(specification).build(filter);
  if (!validation.isValid) throw invalid('Invalid query parameters', validation.errors);

  const hasOrder = filter.orderKey !== undefined;
  return {
    where: { AND: [baseWhere, query.where] },
    orderBy: hasOrder ? (query.orderBy as Record<string, unknown>) : spec.defaultOrder,
    skip: query.skip,
    take: query.take,
    page: filter.page ?? 1,
    rows: query.take,
  };
}

export const paginated = <T>(
  entries: T[],
  totalData: number,
  q: Pick<BuiltList, 'page' | 'rows'>,
) => ({
  entries,
  totalData,
  totalPage: Math.max(1, Math.ceil(totalData / q.rows)),
  page: q.page,
  rows: q.rows,
});
