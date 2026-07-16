import "@testing-library/jest-dom/vitest";

// jsdom lacks these; components under test call them.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}
