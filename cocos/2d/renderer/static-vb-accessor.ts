/*
 Copyright (c) 2021 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

/**
 * @packageDocumentation
 * @hidden
 */

import { Device, Attribute } from '../../core/gfx';
import { MeshBuffer } from './mesh-buffer';
import { BufferAccessor } from './buffer-accessor';
import { assertID, warnID } from '../../core/platform/debug';
import { assertIsTrue } from '../../core/data/utils/asserts';
import { Pool } from '../../core/memop/pool';

interface IFreeEntry {
    offset: number;
    length: number;
}

const _entryPool = new Pool<IFreeEntry>(() => ({
    offset: 0,
    length: 0,
}), 32);

/**
 * @internal
 */
export class StaticVBChunk {
    // public ib: Uint16Array;
    constructor (
        public vertexAccessor: StaticVBAccessor,
        public bufferId: number,
        public vertexOffset: number,
        public vb: Float32Array,
        indexCount: number,
    ) {
        // this.ib = new Uint16Array(indexCount);
    }
    // setIndexBuffer (indices: ArrayLike<number>) {
    //     assertIsTrue(indices.length === this.ib.length);
    //     for (let i = 0; i < indices.length; ++i) {
    //         const vid = indices[i];
    //         this.ib[i] = this.vertexOffset + vid;
    //     }
    // }
}

export class StaticVBAccessor extends BufferAccessor {
    private _freeLists: IFreeEntry[][] = [];

    public constructor (device: Device, attributes: Attribute[]) {
        super(device, attributes);
        // Initialize first mesh buffer
        this._allocateBuffer();
    }

    public destroy () {
        // Destroy mesh buffers and reuse free entries
        for (let i = 0; i < this._buffers.length; ++i) {
            this._buffers[i].destroy();
            const freeList = this._freeLists[i];
            for (let j = 0; j < freeList.length; ++j) {
                _entryPool.free(freeList[j]);
            }
        }
        this._buffers.length = 0;
        this._freeLists.length = 0;
        super.destroy();
    }

    public reset () {
        for (let i = 0; i < this._buffers.length; ++i) {
            const buffer = this._buffers[i];
            // Reset index buffer
            buffer.indexOffset = 0;
            buffer.reset();
        }
    }

    public getVertexBuffer (bid: number): Float32Array {
        return this._buffers[bid].vData;
    }

    public getIndexBuffer (bid: number): Uint16Array {
        return this._buffers[bid].iData;
    }

    public getMeshBuffer (bid: number): MeshBuffer {
        return this._buffers[bid];
    }

    public uploadBuffers () {
        for (let i = 0; i < this._buffers.length; ++i) {
            const firstEntry = this._freeLists[i][0];
            const buffer = this._buffers[i];
            // Recognize active buffers
            if (!firstEntry || firstEntry.length < buffer.vData.byteLength) {
                buffer.uploadBuffers();
            }
            // Need destroy empty buffer
        }
    }

    public appendIndices (vbChunk: StaticVBChunk) {
        // const buf = this._buffers[vbChunk.bufferId];
        // // Vertex format check
        // // assertIsTrue(vbChunk.vb.byteLength / vbChunk.vertexCount === this.vertexFormatBytes);
        // assertIsTrue(vbChunk.bufferId === this._currBID || this._currBID === -1);
        // const vCount = vbChunk.ib.length;
        // if (vCount) {
        //     // Append index buffer
        //     buf.iData.set(vbChunk.ib, buf.indexOffset);
        //     buf.indexOffset += vbChunk.ib.length;
        // }
    }

    public allocateChunk (vertexCount: number, indexCount: number) {
        const byteLength = vertexCount * this.vertexFormatBytes;
        let buf: MeshBuffer = null!; let freeList: IFreeEntry[];
        let bid = 0; let eid = -1; let entry: IFreeEntry | null = null;
        // Loop buffers
        for (let i = 0; i < this._buffers.length; ++i) {
            buf = this._buffers[i];
            freeList = this._freeLists[i];
            // Loop entries
            for (let e = 0; e < freeList.length; ++e) {
                // Found suitable free entry
                if (freeList[e].length >= byteLength) {
                    entry = freeList[e];
                    bid = i;
                    eid = e;
                    break;
                }
            }
            if (entry) break;
        }
        // Allocation fail
        if (!entry) {
            bid = this._allocateBuffer();
            buf = this._buffers[bid];
            if (buf && buf.checkCapacity(vertexCount, indexCount)) {
                eid = 0;
                entry = this._freeLists[bid][eid];
            }
        }
        // Allocation succeed
        if (entry) {
            const vertexOffset = entry.offset / this.vertexFormatBytes;
            assertIsTrue(Number.isInteger(vertexOffset));
            const vb = new Float32Array(buf.vData.buffer, entry.offset, byteLength >> 2);
            this._allocateChunkFromEntry(bid, eid, entry, byteLength);
            return new StaticVBChunk(this, bid, vertexOffset, vb, indexCount);
        } else {
            warnID(9004, byteLength);
            return null;
        }
    }

    public recycleChunk (chunk: StaticVBChunk) {
        const freeList = this._freeLists[chunk.bufferId];
        const buf = this._buffers[chunk.bufferId];
        let offset = chunk.vertexOffset * this.vertexFormatBytes;
        let bytes = chunk.vb.byteLength;
        if (bytes === 0) return;
        let recycled = false;
        let i = 0;
        let prevEntry: IFreeEntry|null = null;
        let nextEntry: IFreeEntry|null = freeList[i];
        // Loop entries
        while (nextEntry && nextEntry.offset < offset) {
            prevEntry = nextEntry;
            nextEntry = freeList[++i];
        }
        // Found previous entry
        if (prevEntry) {
            const distance = offset - (prevEntry.offset + prevEntry.length);
            // Ensure no overlap with previous chunk
            assertIsTrue(distance >= 0);
            // Can be merged
            if (distance === 0) {
                prevEntry.length += bytes;
                offset = prevEntry.offset;
                bytes = prevEntry.length;

                // Can also merge with next entry
                if (nextEntry && nextEntry.offset - (offset + bytes) === 0) {
                    prevEntry.length += nextEntry.length;
                    // Free next entry
                    freeList.splice(i, 1);
                    _entryPool.free(nextEntry);
                    nextEntry = null;
                }
                recycled = true;
            }
        }
        // Found next entry
        if (!recycled && nextEntry) {
            const distance = nextEntry.offset - (offset + bytes);
            // Ensure no overlap with next chunk
            assertIsTrue(distance >= 0);
            // Can be merged
            if (distance === 0) {
                nextEntry.offset = offset;
                nextEntry.length += bytes;
            } else {
            // Can not be merged
                const newEntry = _entryPool.alloc();
                newEntry.offset = offset;
                newEntry.length = bytes;
                freeList.splice(i, 0, newEntry);
            }
            recycled = true;
        }
        if (recycled) {
            // If the last chunk is recycled, ensure correct mesh buffer byte offset
            if (offset + bytes === buf.byteOffset) {
                buf.byteOffset = offset;
            }
        } else {
            // Haven't found any entry or any entry after the buffer chunk
            const newEntry = _entryPool.alloc();
            newEntry.offset = offset;
            newEntry.length = bytes;
            freeList.push(newEntry);
        }
    }

    private _allocateChunkFromEntry (bid: number, eid: number, entry: IFreeEntry, bytes: number) {
        const remaining = entry.length - bytes;
        const offset = entry.offset + bytes;
        const buf = this._buffers[bid];
        if (buf.byteOffset < offset) {
            // Ensure buffer length covers all buffer chunks
            buf.byteOffset = offset;
        }
        assertID(remaining >= 0, 9004, bid, entry.offset, entry.length);
        if (remaining === 0) {
            this._freeLists[bid].splice(eid, 1);
            _entryPool.free(entry);
        } else {
            entry.offset += bytes;
            entry.length = remaining;
        }
    }

    private _allocateBuffer () {
        // Validate length of buffer array
        assertID(this._buffers.length === this._freeLists.length, 9003);

        const buffer = new MeshBuffer();
        buffer.initialize(this._device, this._attributes);
        this._buffers.push(buffer);
        const entry = _entryPool.alloc();
        entry.offset = 0;
        entry.length = buffer.vData.byteLength;
        const freeList = [entry];
        this._freeLists.push(freeList);
        return this._buffers.length - 1;
    }
}
