# adapted from https://gist.github.com/jcupitt/ee3afcbb931b41b4d7f4
import sys
import pyvips
import os

N_BINS = 10
BIN_SIZE = 256 / N_BINS

# adjust sample file here
filename = "bel-123456-http%3A%2F%2Fpywb.ehelvetica.localhost%3A8088%2Fnb-webarchive%2F20190821092848%2Fhttp%3A%2F%2Fwww.sample.ch.jpg"
im = pyvips.Image.new_from_file(filename, access="sequential")
# turn to lab
im = im.colourspace("lab")

# turn to 8-bit unsigned so we can make a histogram
# use 0 - 255 to be -128 - +127 for a/b
# and 0 - 255 for 0 - 100 L
im += [0, 128, 128]
im *= [255.0 / 100, 1, 1]
im = im.cast("uchar")

# make a 3D histogram of the 8-bit LAB image
hist = im.hist_find_ndim(bins=N_BINS)

# find the position of the maximum
v, x, y = hist.maxpos()

# get the pixel at (x, y)
pixel = hist(x, y)

# find the index of the max value in the pixel
band = pixel.index(v)

# scale up for the number of bins
x = x * BIN_SIZE + BIN_SIZE / 2
y = y * BIN_SIZE + BIN_SIZE / 2
band = band * BIN_SIZE + BIN_SIZE / 2

# turn the index back into the LAB colour
L = x * (100.0 / 255)
a = y - 128
b = band - 128

print("dominant colour:")
print("   L = ", L)
print("   a = ", a)
print("   b = ", b)
