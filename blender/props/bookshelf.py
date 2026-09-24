'''Open bookshelf with a mix of upright, leaning, and stacked books.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.bookshelf('b_'), 'bookshelf')
export()
