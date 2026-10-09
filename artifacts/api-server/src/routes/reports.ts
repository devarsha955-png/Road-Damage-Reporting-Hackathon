import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateReportBody,
  CreateReportResponse,
  GetReportParams,
  GetReportResponse,
  GetReportStatisticsResponse,
  GetReportPhotoParams,
  ListReportsQueryParams,
  ListReportsResponse,
  UploadReportPhotoBody,
  UploadReportPhotoResponse,
} from "@workspace/api-zod";
import { ObjectId } from "mongodb";
import { getRoadwatchCollections, type StoredReport } from "../lib/mongo";

const router: IRouter = Router();
const reportStatuses = ["received", "reviewing", "scheduled", "resolved"] as const;
const maxPhotoBytes = 3 * 1024 * 1024;

function toRoadReport(report: StoredReport) {
  return {
    id: report._id.toHexString(),
    trackingCode: report.trackingCode,
    title: report.title,
    description: report.description,
    address: report.address,
    latitude: report.latitude,
    longitude: report.longitude,
    severity: report.severity,
    status: report.status,
    photoId: report.photoId,
    photoUrl: report.photoId ? `/api/uploads/${report.photoId}` : null,
    reporterName: report.reporterName,
    createdAt: report.createdAt.toISOString(),
  };
}

function sendStorageUnavailable(
  req: Request,
  res: Response,
  error: unknown,
): void {
  req.log.error({ err: error }, "Roadwatch MongoDB request failed");
  res.status(503).json({
    error:
      "Roadwatch storage is unavailable. Add a valid MONGO_URI secret and confirm your MongoDB network access settings.",
  });
}

function photoMatchesContentType(
  bytes: Buffer,
  contentType: string,
): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return (
    contentType === "image/webp" &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

router.get("/reports", async (req, res): Promise<void> => {
  const query = ListReportsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid report filters." });
    return;
  }

  try {
    const { reports } = await getRoadwatchCollections();
    const filter: Record<string, unknown> = {};
    if (query.data.status) filter.status = query.data.status;
    const search = query.data.search?.trim().slice(0, 100);
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matcher = new RegExp(escapedSearch, "i");
      filter.$or = [
        { title: matcher },
        { description: matcher },
        { address: matcher },
        { trackingCode: matcher },
      ];
    }

    const found = await reports
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json(ListReportsResponse.parse(found.map(toRoadReport)));
  } catch (error) {
    sendStorageUnavailable(req, res, error);
  }
});

router.post("/reports", async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the report details and try again." });
    return;
  }

  try {
    const { reports, photos } = await getRoadwatchCollections();
    const photoId = parsed.data.photoId ?? null;
    if (photoId && (!ObjectId.isValid(photoId) || !(await photos.findOne({ _id: new ObjectId(photoId) })))) {
      res.status(400).json({ error: "The attached photo could not be found." });
      return;
    }

    const id = new ObjectId();
    const report: StoredReport = {
      _id: id,
      trackingCode: `RW-${id.toHexString().slice(-8).toUpperCase()}`,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      address: parsed.data.address.trim(),
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      severity: parsed.data.severity,
      status: "received",
      photoId,
      reporterName: parsed.data.reporterName?.trim() || null,
      createdAt: new Date(),
    };

    await reports.insertOne(report);
    res.status(201).json(CreateReportResponse.parse(toRoadReport(report)));
  } catch (error) {
    sendStorageUnavailable(req, res, error);
  }
});

router.get("/reports/statistics", async (req, res): Promise<void> => {
  try {
    const { reports } = await getRoadwatchCollections();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [total, received, reviewing, scheduled, resolved, updatedToday] =
      await Promise.all([
        reports.countDocuments(),
        reports.countDocuments({ status: "received" }),
        reports.countDocuments({ status: "reviewing" }),
        reports.countDocuments({ status: "scheduled" }),
        reports.countDocuments({ status: "resolved" }),
        reports.countDocuments({ createdAt: { $gte: startOfToday } }),
      ]);
    res.json(
      GetReportStatisticsResponse.parse({
        total,
        received,
        reviewing,
        scheduled,
        resolved,
        updatedToday,
      }),
    );
  } catch (error) {
    sendStorageUnavailable(req, res, error);
  }
});

router.get("/reports/:id", async (req, res): Promise<void> => {
  const params = GetReportParams.safeParse(req.params);
  if (!params.success || !ObjectId.isValid(params.data.id)) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  try {
    const { reports } = await getRoadwatchCollections();
    const report = await reports.findOne({ _id: new ObjectId(params.data.id) });
    if (!report) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    res.json(GetReportResponse.parse(toRoadReport(report)));
  } catch (error) {
    sendStorageUnavailable(req, res, error);
  }
});

router.post("/uploads", async (req, res): Promise<void> => {
  const parsed = UploadReportPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image under 3 MB." });
    return;
  }

  try {
    const bytes = Buffer.from(parsed.data.data, "base64");
    if (
      bytes.length === 0 ||
      bytes.length > maxPhotoBytes ||
      !photoMatchesContentType(bytes, parsed.data.contentType)
    ) {
      res.status(400).json({ error: "The selected file is not a supported image under 3 MB." });
      return;
    }

    const { photos } = await getRoadwatchCollections();
    const id = new ObjectId();
    await photos.insertOne({
      _id: id,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      bytes,
      createdAt: new Date(),
    });
    const result = UploadReportPhotoResponse.parse({
      id: id.toHexString(),
      url: `/api/uploads/${id.toHexString()}`,
    });
    res.status(201).json(result);
  } catch (error) {
    sendStorageUnavailable(req, res, error);
  }
});

router.get("/uploads/:id", async (req, res): Promise<void> => {
  const params = GetReportPhotoParams.safeParse(req.params);
  if (!params.success || !ObjectId.isValid(params.data.id)) {
    res.status(404).json({ error: "Photo not found." });
    return;
  }

  try {
    const { photos } = await getRoadwatchCollections();
    const photo = await photos.findOne({ _id: new ObjectId(params.data.id) });
    if (!photo) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }
    res
      .status(200)
      .type(photo.contentType)
      .set({
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      })
      .send(Buffer.from(photo.bytes));
  } catch (error) {
    sendStorageUnavailable(req, res, error);
  }
});

export default router;
