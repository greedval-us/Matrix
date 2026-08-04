import path from "path";
import { DOCUMENT_LOOKUP_FORMAT_VERSION } from "../../localdb/constants.js";

export class LocalIndexBuildPlanner {
  constructor({ jsonLinesRepository }) {
    this.jsonLinesRepository = jsonLinesRepository;
  }

  async createPlan({ paths, documentFiles, previousState }) {
    const snapshots = await this.readFileSnapshots(paths, documentFiles);
    const hasIndexes = await this.jsonLinesRepository.exists(paths.indexesDir);
    const previousManifest = this.normalizeManifest(previousState?.fileManifest);
    const lookupFormatVersion = Number(previousState?.lookupFormatVersion || 1);

    if (!hasIndexes || previousState?.status !== "completed" || previousManifest.size === 0) {
      return await this.buildFullPlan(paths, snapshots, "initial-build");
    }

    if (lookupFormatVersion !== DOCUMENT_LOOKUP_FORMAT_VERSION) {
      return await this.buildFullPlan(paths, snapshots, "lookup-format-changed");
    }

    const removedFiles = this.collectRemovedFiles(previousManifest, snapshots);
    const changedFiles = this.collectChangedFiles(previousManifest, snapshots);
    if (removedFiles.length > 0 || changedFiles.length > 0) {
      return await this.buildFullPlan(paths, snapshots, "source-files-changed");
    }

    const newSnapshots = snapshots.filter((snapshot) => !previousManifest.has(snapshot.fileName));
    const unchangedSnapshots = snapshots.filter((snapshot) => previousManifest.has(snapshot.fileName));

    if (newSnapshots.length === 0) {
      return this.buildNoopPlan(previousManifest, unchangedSnapshots);
    }

    const newFilePlans = await this.createFilePlans(paths, newSnapshots);
    const reusedDocuments = unchangedSnapshots.reduce((total, snapshot) => {
      return total + Number(previousManifest.get(snapshot.fileName)?.documentsTotal || 0);
    }, 0);

    return {
      mode: "incremental",
      reason: "new-document-files",
      filePlans: newFilePlans,
      filesTotal: newFilePlans.length,
      documentsTotal: 0,
      reusedFiles: unchangedSnapshots.length,
      reusedDocuments,
      fileManifest: this.buildManifestFromPlans([
        ...unchangedSnapshots.map((snapshot) => ({
          ...snapshot,
          documentsTotal: Number(previousManifest.get(snapshot.fileName)?.documentsTotal || 0),
        })),
        ...newFilePlans,
      ]),
    };
  }

  async createResumePlan({ paths, documentFiles, previousState }) {
    if (Number(previousState?.lookupFormatVersion || 1) !== DOCUMENT_LOOKUP_FORMAT_VERSION) {
      return null;
    }

    const snapshots = await this.readFileSnapshots(paths, documentFiles);
    const previousManifest = this.normalizeManifest(previousState?.fileManifest);
    const currentManifest = this.buildManifestFromPlans(snapshots);

    if (!this.areManifestEntriesEqual(previousManifest, new Map(Object.entries(currentManifest)))) {
      return null;
    }

    const pendingFiles = Array.isArray(previousState?.session?.pendingFiles)
      ? previousState.session.pendingFiles
      : [];
    const pendingSnapshots = snapshots.filter((snapshot) => pendingFiles.includes(snapshot.fileName));
    const filePlans = await this.createFilePlans(paths, pendingSnapshots);

    return {
      filePlans,
      documentsTotal: 0,
    };
  }

  async buildFullPlan(paths, snapshots, reason) {
    const filePlans = await this.createFilePlans(paths, snapshots);
    return {
      mode: "full",
      reason,
      filePlans,
      filesTotal: filePlans.length,
      documentsTotal: 0,
      reusedFiles: 0,
      reusedDocuments: 0,
      fileManifest: this.buildManifestFromPlans(filePlans),
    };
  }

  buildNoopPlan(previousManifest, unchangedSnapshots) {
    const reusedDocuments = unchangedSnapshots.reduce((total, snapshot) => {
      return total + Number(previousManifest.get(snapshot.fileName)?.documentsTotal || 0);
    }, 0);

    return {
      mode: "noop",
      reason: "no-document-changes",
      filePlans: [],
      filesTotal: 0,
      documentsTotal: 0,
      reusedFiles: unchangedSnapshots.length,
      reusedDocuments,
      fileManifest: Object.fromEntries(previousManifest),
    };
  }

  async createFilePlans(paths, snapshots) {
    const plans = [];

    for (const snapshot of snapshots) {
      const filePath = path.join(paths.documentsDir, snapshot.fileName);
      plans.push({
        ...snapshot,
        filePath,
        documentsTotal: 0,
      });
    }

    return plans;
  }

  async readFileSnapshots(paths, documentFiles) {
    const snapshots = [];

    for (const fileName of documentFiles) {
      const filePath = path.join(paths.documentsDir, fileName);
      const stat = await this.jsonLinesRepository.stat(filePath);
      snapshots.push({
        fileName,
        size: stat.size,
        modifiedAtMs: stat.mtimeMs,
      });
    }

    return snapshots;
  }

  normalizeManifest(fileManifest) {
    const entries = Object.entries(fileManifest || {}).map(([fileName, value]) => [
      fileName,
      {
        size: Number(value?.size || 0),
        modifiedAtMs: Number(value?.modifiedAtMs || 0),
        documentsTotal: Number(value?.documentsTotal || 0),
      },
    ]);

    return new Map(entries);
  }

  areManifestEntriesEqual(leftManifest, rightManifest) {
    if (leftManifest.size !== rightManifest.size) return false;

    for (const [fileName, leftValue] of leftManifest.entries()) {
      const rightValue = rightManifest.get(fileName);
      if (!rightValue) return false;
      if (
        Number(leftValue.size || 0) !== Number(rightValue.size || 0) ||
        Number(leftValue.modifiedAtMs || 0) !== Number(rightValue.modifiedAtMs || 0)
      ) {
        return false;
      }
    }

    return true;
  }

  collectRemovedFiles(previousManifest, snapshots) {
    const currentFiles = new Set(snapshots.map((snapshot) => snapshot.fileName));
    return [...previousManifest.keys()].filter((fileName) => !currentFiles.has(fileName));
  }

  collectChangedFiles(previousManifest, snapshots) {
    const changedFiles = [];

    for (const snapshot of snapshots) {
      const previousSnapshot = previousManifest.get(snapshot.fileName);
      if (!previousSnapshot) continue;

      if (
        previousSnapshot.size !== snapshot.size ||
        previousSnapshot.modifiedAtMs !== snapshot.modifiedAtMs
      ) {
        changedFiles.push(snapshot.fileName);
      }
    }

    return changedFiles;
  }

  buildManifestFromPlans(filePlans) {
    return Object.fromEntries(
      filePlans.map((plan) => [
        plan.fileName,
        {
          size: Number(plan.size || 0),
          modifiedAtMs: Number(plan.modifiedAtMs || 0),
          documentsTotal: Number(plan.documentsTotal || 0),
        },
      ])
    );
  }
}
