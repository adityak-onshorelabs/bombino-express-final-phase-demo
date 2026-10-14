import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";

import { canMarkTestOrders, isTestPhone, seesTestOrders, withoutHiddenTestRows } from "./testOrders.js";
import { isTestAwb, isTestOrderMetadata, testAwbFor } from "../shared/testOrders.js";
import { isTestOtpNumber } from "./otp.js";
import { applyOpsBoardQuery, DEFAULT_OPS_BOARD_FILTERS } from "../shared/opsBoardQuery.js";

test("fixed-OTP test numbers and the team's real test phone make test orders", () => {
  assert.equal(isTestPhone("9000000090"), true);
  assert.equal(isTestPhone("+91 90000 00096"), true);
  assert.equal(isTestPhone("7558372885"), true);
  assert.equal(isTestPhone("+917558372885"), true);
  assert.equal(isTestPhone("9833207558"), true);
});

test("the team's real test phone still logs in with a real code", () => {
  assert.equal(isTestOtpNumber("7558372885"), false);
});

test("the real-view login takes 121212 but is not a test phone", () => {
  assert.equal(isTestOtpNumber("9000000099"), true);
  assert.equal(isTestPhone("9000000099"), false);
});

test("other numbers are real", () => {
  assert.equal(isTestPhone("9867603072"), false);
  assert.equal(isTestPhone(null), false);
  assert.equal(isTestPhone("12345"), false);
});

test("only the test super admin's number may mark orders test or real", () => {
  assert.equal(canMarkTestOrders("9000000011"), true);
  assert.equal(canMarkTestOrders("+91 90000 00011"), true);
  assert.equal(canMarkTestOrders("9000000010"), false);
  assert.equal(canMarkTestOrders("7558372885"), false);
  assert.equal(canMarkTestOrders(null), false);
});

test("only metadata.test === true marks a test order", () => {
  assert.equal(isTestOrderMetadata({ test: true, marksTest: false }), true);
  assert.equal(isTestOrderMetadata({ test: "true" }), false);
  assert.equal(isTestOrderMetadata({}), false);
  assert.equal(isTestOrderMetadata(null), false);
});

test("a test AWB is TEST + the order number's digits, and is recognised", () => {
  assert.equal(testAwbFor("BOM-100345"), "TEST100345");
  assert.equal(isTestAwb("TEST100345"), true);
  assert.equal(isTestAwb("test100345"), true);
  assert.equal(isTestAwb("800123456789"), false);
  assert.equal(isTestAwb(null), false);
});

function req(staff: Request["staff"]): Request {
  return { staff, session: {} } as unknown as Request;
}

const rows = [{ id: "a", is_test: false }, { id: "b", is_test: true }];

test("real staff never see test rows", () => {
  const admin = req({ role: "admin", scoped: false, city: null, test: false, marksTest: false });
  assert.equal(seesTestOrders(admin), false);
  assert.deepEqual(withoutHiddenTestRows(admin, rows).map((r) => r.id), ["a"]);
});

test("test staff always see them", () => {
  const testBranch = req({ role: "branch_manager", scoped: true, city: "Mumbai", test: true, marksTest: false });
  assert.deepEqual(withoutHiddenTestRows(testBranch, rows).map((r) => r.id), ["a", "b"]);
});

test("the real/test filter: real hides test orders, test shows only them", () => {
  const orders = [
    { order_no: "BOM-1", is_test: false },
    { order_no: "BOM-2", is_test: true },
  ].map((o) => ({
    ...o,
    status: "pickup_requested",
    created_at: "2026-10-14T00:00:00Z",
    pickup_request: 1,
    pickup_date: null,
    payment_method: "pay_now",
    is_cod: false,
    agent_id: null,
    consignee_name: null,
    consignee_city: null,
    awb_no: null,
    guest_name: null,
    guest_phone: null,
    customer_name: null,
    customer_phone: null,
  }));
  const only = (testKind: "all" | "real" | "test") =>
    applyOpsBoardQuery(orders, {
      filters: { ...DEFAULT_OPS_BOARD_FILTERS, testKind },
      config: {},
      query: "",
      sort: "newest",
    }).map((o) => o.order_no);
  assert.deepEqual(only("all").sort(), ["BOM-1", "BOM-2"]);
  assert.deepEqual(only("real"), ["BOM-1"]);
  assert.deepEqual(only("test"), ["BOM-2"]);
});

test("a super admin does not see them either", () => {
  const superAdmin = req({ role: "super_admin", scoped: false, city: null, test: false, marksTest: false });
  assert.equal(seesTestOrders(superAdmin), false);
  assert.deepEqual(withoutHiddenTestRows(superAdmin, rows).map((r) => r.id), ["a"]);
});
