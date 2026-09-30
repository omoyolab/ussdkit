import { describe, expect, it } from "vitest";

import { paginate } from "../src/util/paginate.js";

const banks = ["Access", "First Bank", "GTBank", "Kuda", "Opay", "UBA", "Zenith"];

describe("paginate", () => {
  it("renders the first page with a More key", () => {
    const page = paginate(banks, { perPage: 3 });
    expect(page.text).toBe("1. Access\n2. First Bank\n3. GTBank\n9. More");
    expect(page.pageCount).toBe(3);
    expect(page.hasNext).toBe(true);
    expect(page.hasPrev).toBe(false);
    expect(page.select("2")).toBe("First Bank");
    expect(page.select("4")).toBeUndefined();
    expect(page.isNext("9")).toBe(true);
    expect(page.isPrev("0")).toBe(false);
  });

  it("renders a middle page with both keys and the last page with Back only", () => {
    const middle = paginate(banks, { perPage: 3, page: 1 });
    expect(middle.text).toBe("1. Kuda\n2. Opay\n3. UBA\n9. More\n0. Back");
    const last = paginate(banks, { perPage: 3, page: 2 });
    expect(last.text).toBe("1. Zenith\n0. Back");
    expect(last.isPrev("0")).toBe(true);
    expect(last.isNext("9")).toBe(false);
  });

  it("clamps out-of-range pages and supports custom keys and labels", () => {
    expect(paginate(banks, { perPage: 3, page: 99 }).page).toBe(2);
    expect(paginate(banks, { perPage: 3, page: -5 }).page).toBe(0);
    const page = paginate(banks, {
      perPage: 2,
      page: 1,
      nextKey: "#",
      prevKey: "*",
      nextLabel: "Next",
      prevLabel: "Prev",
    });
    expect(page.text).toBe("1. GTBank\n2. Kuda\n#. Next\n*. Prev");
  });

  it("handles empty lists", () => {
    const page = paginate([]);
    expect(page.text).toBe("");
    expect(page.pageCount).toBe(1);
    expect(page.select("1")).toBeUndefined();
  });
});
