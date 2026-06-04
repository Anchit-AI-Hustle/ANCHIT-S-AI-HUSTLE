// Scratch script to check environment variable keys (excluding values for security)
console.log("Checking environment variable keys:");
Object.keys(process.env).sort().forEach(key => {
  if (key.includes("API") || key.includes("KEY") || key.includes("SECRET") || key.includes("URL") || key.includes("GEMINI") || key.includes("GOOGLE") || key.includes("REPLICATE") || key.includes("ELEVEN")) {
    console.log(`- ${key}: [SET]`);
  }
});
