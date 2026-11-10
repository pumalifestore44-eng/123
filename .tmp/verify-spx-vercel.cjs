const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const builderPath = 'C:/Users/Dell/AppData/Roaming/npm/node_modules/vercel/node_modules/@vercel/node';
const { build } = require(builderPath);
const { FileBlob } = require('C:/Users/Dell/AppData/Roaming/npm/node_modules/vercel/node_modules/@vercel/build-utils');

(async () => {
    const workPath = path.resolve('.tmp/spx-vercel-build');
    const files = {};
    for (const filename of ['api/spx-track.js', 'api/package.json', 'spx-tracking-utils.mjs']) {
        files[filename] = new FileBlob({ data: await fs.readFile(filename) });
    }
    files['package.json'] = new FileBlob({ data: JSON.stringify({ private: true, engines: { node: '22.x' } }) });
    const result = await build({ files, entrypoint: 'api/spx-track.js', workPath,
        config: { zeroConfig: true, includeFiles: 'spx-tracking-utils.mjs', projectSettings: { installCommand: '', buildCommand: '' } },
        meta: {}, considerBuildCommand: true });
    const output = result.output;
    const lambda = output.files ? output : Object.values(output).find(v => v?.files);
    assert.ok(lambda, 'Expected a Vercel Lambda artifact');
    const bundlePath = path.resolve('.tmp/spx-vercel-artifact');
    for (const [filename, file] of Object.entries(lambda.files)) {
        const target = path.join(bundlePath, filename);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const stream = await file.toStream();
        const chunks = [];
        await new Promise((resolve, reject) => { stream.on('data', chunk => chunks.push(Buffer.from(chunk))); stream.on('end', resolve); stream.on('error', reject); });
        await fs.writeFile(target, Buffer.concat(chunks));
    }
    assert.ok(lambda.files['spx-tracking-utils.mjs'], 'Shared SPX helper must be included');
    assert.equal(JSON.parse(await fs.readFile(path.join(bundlePath, 'api/package.json'), 'utf8')).type, 'module');
    const { default: handler } = await import(pathToFileURL(path.join(bundlePath, 'api/spx-track.js')));
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'GET', url: '/api/spx-track?spx_tn=SPXVN06196639730A' }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.spx_tn, 'SPXVN06196639730A');
    console.log('PASS: Vercel builder produces native ESM, includes shared helper, packaged handler starts and calls live SPX:', res.body.tracking_code_group_name);
})().catch(err => { console.error(err); process.exitCode = 1; });
