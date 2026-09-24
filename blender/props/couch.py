'''Two-seat lounge couch with plump cushions, a throw pillow, and wooden legs.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.couch('c_'), 'couch')
export()
