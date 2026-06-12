export function paginate<T>(items: T[], page = 1, perPage = 10) {
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const offset = (currentPage - 1) * perPage;
  const data = items.slice(offset, offset + perPage);

  return {
    current_page: currentPage,
    data,
    per_page: perPage,
    total,
    last_page: lastPage,
    from: total ? offset + 1 : 0,
    to: offset + data.length,
    first_page_url: null,
    last_page_url: null,
    next_page_url: currentPage < lastPage ? String(currentPage + 1) : null,
    prev_page_url: currentPage > 1 ? String(currentPage - 1) : null,
    path: null,
    links: [],
  };
}
