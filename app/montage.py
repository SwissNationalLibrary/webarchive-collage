from xmlrpc.client import Boolean
import pyvips
#import psutil
import mmap
import glob
from os.path import isfile, join
import sys
import os
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--path', '-p', help='Source path for JPEG images (*.jpg)',
                    type=str, default="/data/thumbnails")
parser.add_argument('--infile', '-i', help='Path to text file containing source image path (one per line)',
                    type=str)
parser.add_argument(
    '--across', '-s', help='Row size of superimage', type=int, default=15)
parser.add_argument(
    '--debug', '-d', help='Debug', type=bool, default=False)
parser.add_argument(
    '--count', '-c', help='Maximum number of files to process', type=int, default=1000000)
parser.add_argument('--out', '-o',
                    help='Output path', type=str, default="/data")
parser.add_argument('--prefix', help='Output filename prefix',
                    type=str, default="montage")
args = parser.parse_args()

source_path = os.path.join(args.path, "*.jpg")
row_size = args.across
target_prefix = args.prefix
target_path = args.out
max_count = args.count
debug = args.debug

print("using pyvips version %i.%i.%i" %
      (pyvips.base.version(0), pyvips.base.version(1), pyvips.base.version(2)))
print("using folder %s with row_size %s and target_path=%s, target_prefix=%s" %
      (source_path, row_size, target_path, target_prefix))

if args.infile:
    print("reading list of files from %s" % (args.infile))
    with open(args.infile) as f:
        files = f.read().splitlines()
else:
    files = glob.glob(source_path)

print("number of files matching = %s" % len(files))
if (len(files) == 0):
    print("no files found to process")
    exit(0)

# see https://stackoverflow.com/questions/50297176/merge-large-images-on-disk/50315274
# https://github.com/libvips/pyvips/issues/98
# https://stackoverflow.com/questions/47852390/making-a-huge-image-mosaic-with-pyvips
# https://github.com/libvips/pyvips/issues/43


def posteval_cb(image, progress):
    print('posteval:', image)


def eval_cb(image, progress):
    # print('{}%, eta {}s vmem={} '.format(
    # progress.percent, progress.eta, psutil.virtual_memory()))
    print('{}%, eta {}s '.format(
        progress.percent, progress.eta))


# - make a set of pyvips images from a set of pointers to memory mapped files
# - the pointer objects need to support the buffer protocol, ie. refcounts,
# and will not be copied
# - format is something like "char" or "float"
images = []
#os.environ['VIPS_CONCURRENCY'] = "1"
#os.environ['VIPS_DISC_THRESHOLD'] = "100"
for filename in files[0:min(len(files), max_count)]:
    # with open(filename, "r+b") as f:
    #image = pyvips.Image.new_from_memory(f.fileno, 2724, 2048, 3, np.float64)
    print('.', end='', flush=True)
    image = pyvips.Image.new_from_file(filename, access='sequential')
    #mm = mmap.mmap(f.fileno(), 0, prot=mmap.PROT_READ)
    # print(mm)
    # image = pyvips.Image.new_from_memory(
    #     mm, bands=3, width=2724, height=2048, format=np.uint16)
    image.set_progress(True)
    image.signal_connect('posteval', posteval_cb)
    image.signal_connect('eval', eval_cb)
    images.append(image)

print('added all images, now starting pipeline')

# join into a huge image, eg. 100 tiles across
# you can set margins, alignment, spacing, background, etc.
huge = pyvips.Image.arrayjoin(images, across=row_size)

# write to a file ... you can set a range of options, see eg. the
# tiffsave docs
huge.write_to_file(os.path.join(target_path, target_prefix + '.tif'), Q=80, compression="jpeg",
                   tile=True, tile_width=1024, tile_height=1024, bigtiff=True, pyramid=True)
