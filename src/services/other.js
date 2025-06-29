export async function cleanUpOldFiles(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") console.log("cleanUpOldFiles: ", error);
  }
}
