export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/employees/:path*",
    "/schedule/:path*",
    "/my-shifts/:path*",
    "/clock/:path*",
    "/timesheets/:path*",
    "/locations/:path*",
    "/availability/:path*",
    "/time-off/:path*",
    "/swaps/:path*",
  ],
};
